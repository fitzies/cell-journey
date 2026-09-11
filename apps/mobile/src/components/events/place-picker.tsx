import { Redirect } from 'expo-router';

// Apple Maps is an iOS interaction. Other platforms retain the existing editor.
export default function PlacePicker() {
  return <Redirect href="/create-event" />;
}
