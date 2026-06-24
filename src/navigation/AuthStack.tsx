import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { AuthWelcomeScreen } from '@/screens/auth/AuthWelcomeScreen';
import { LoginScreen } from '@/screens/auth/LoginScreen';
import type { AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthStack() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="AuthWelcome" component={AuthWelcomeScreen} />
        <Stack.Screen name="Login"       component={LoginScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
