import { registerRootComponent } from 'expo';
import App from './App';
import FlipperStatusScreen from './src/FlipperStatusScreen';
registerRootComponent(process.env.EXPO_PUBLIC_APEX_FLIPPER_STATUS === '1' ? FlipperStatusScreen : App);
