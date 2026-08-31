/** Screen hierarchy:
 *  Tabs: Home | Journey (Airport→Flight) | Calm | Journal | More
 *  Stacks over tabs: Chat (modal), Wallet, Weather, Family, Academy, SensorLab, Settings
 *  FlightScreen owns the sensor session; Calm is reachable in ONE tap from anywhere
 *  while a flight session is active (the promise of the product).
 */
import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import Home from "../screens/HomeScreen";
import Flight from "../screens/FlightScreen";
import Calm from "../screens/CalmScreen";
import Journal from "../screens/JournalScreen";
import Chat from "../screens/ChatScreen";
import Settings from "../screens/SettingsScreen";
import SensorLab from "../screens/SensorLabScreen";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function Tabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Home" component={Home} />
      <Tab.Screen name="Flight" component={Flight} />
      <Tab.Screen name="Calm" component={Calm} />
      <Tab.Screen name="Journal" component={Journal} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      <Stack.Screen name="Chat" component={Chat} options={{ presentation: "modal" }} />
      <Stack.Screen name="Settings" component={Settings} />
      <Stack.Screen name="SensorLab" component={SensorLab} />
    </Stack.Navigator>
  );
}
