import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { AppBootstrap } from '@/bootstrap/AppBootstrap';

export default function App() {
  return (
    <>
      <StatusBar style="auto" />
      <AppBootstrap />
    </>
  );
}
