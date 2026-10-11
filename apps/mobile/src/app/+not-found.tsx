import { Text } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '../components/Screen';
import { Button } from '../components/UI';
import { common } from '../theme';
export default function NotFound() {
  return <Screen><Text style={common.title}>let’s find ur way back.</Text><Button label="home, sweet home" onPress={() => router.replace('/')} /></Screen>;
}
