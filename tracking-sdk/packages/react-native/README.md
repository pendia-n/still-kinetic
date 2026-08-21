# @stillkinetic/rn-sdk

Behavioral tracking + threshold-triggered Stripe billing for React Native apps.

## Install

```bash
npm install @stillkinetic/rn-sdk @stripe/stripe-react-native
```

`@stripe/stripe-react-native` is a peer dependency. Follow its own native linking / pod install steps for iOS.

Wrap your app root in Stripe's provider (required by `@stripe/stripe-react-native`):

```tsx
import { StripeProvider } from '@stripe/stripe-react-native';

<StripeProvider publishableKey="pk_live_...">
  <App />
</StripeProvider>
```

## Usage

```tsx
import { useStillKinetic, CardBindScreen } from '@stillkinetic/rn-sdk';
import { ScrollView, TextInput, Pressable, Text } from 'react-native';

const config = {
  appId: 'app_123',
  apiKey: 'pk_app_abc',
  apiBaseUrl: 'https://api.yourplatform.com',
  stripePublishableKey: 'pk_live_...',
  endUserId: currentUser.id,
  trackedMetrics: ['stay_duration', 'type_speed'] as const,
};

function HomeScreen() {
  const { onScroll, onChangeText, onPressIn } = useTrackPay(config, 'HomeScreen');

  return (
    <ScrollView onScroll={onScroll} scrollEventThrottle={16}>
      <TextInput onChangeText={onChangeText} placeholder="Type here" />
      <Pressable onPressIn={onPressIn}>
        <Text>Tap me</Text>
      </Pressable>
    </ScrollView>
  );
}

// One-time screen, shown once per end user before any charge can fire:
function BillingSetupScreen({ navigation }) {
  return (
    <CardBindScreen
      config={config}
      defaultCap={{ amountCents: 5000, period: 'monthly' }}
      onComplete={(result) => {
        if (result.success) navigation.goBack();
        else console.error(result.error);
      }}
    />
  );
}
```

## Screen focus vs mount/unmount

`useStayTracker` (used internally by `useTrackPay`) starts/stops its timer on component mount/unmount and pauses on app background. If you use React Navigation and want stay-duration to reset per screen *focus* (not just mount), call `useTrackPay` inside a screen component that React Navigation actually unmounts on blur (e.g. within a stack navigator with `unmountOnBlur`), or wrap it in your own `useFocusEffect` that calls `tp.start()`/`stop()`-equivalent logic — the hook is intentionally simple so it composes with whatever navigation library you use.

## Notes

Same architecture as the web SDK: this package only reports metrics and handles the one-time card bind. All threshold evaluation and Stripe charges happen server-side.

Each hook mount receives a fresh visit identifier. Use the exported `getAccessStatus(config, metric)` before opening protected content, and use `config.onAccessDecision` to show the returned cap message and lock the screen when status is `cap_reached`.
