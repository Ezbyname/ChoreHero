// Must be the first import — captures auth-redirect URL markers before
// Supabase's client (constructed transitively via the App import below)
// has a chance to process and strip them. See authRedirectDetection.ts.
import '@/lib/authRedirectDetection';

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
