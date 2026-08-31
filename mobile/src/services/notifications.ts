/** Local-first notifications: boarding reminders schedule ON-DEVICE from the
 *  countdown, so they fire with zero connectivity. Push (gate changes, family
 *  landing alerts) rides APNs/FCM via the backend when online. */
import * as Notifications from "expo-notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export async function scheduleBoardingReminders(departAt: Date, gate: string) {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") return false;
  const at = (minsBefore: number) => new Date(departAt.getTime() - minsBefore * 60000);
  const calm = { sound: false as const };
  if (at(45) > new Date())
    await Notifications.scheduleNotificationAsync({
      content: { title: "Boarding begins now", body: `Gate ${gate} — a 9-minute walk. You have plenty of time.`, ...calm },
      trigger: at(45),
    });
  if (at(15) > new Date())
    await Notifications.scheduleNotificationAsync({
      content: { title: "Doors close in 15 minutes", body: "Time to be seated. I'll be with you from the moment you sit down.", ...calm },
      trigger: at(15),
    });
  return true;
}

export async function registerPush(api: { post: (p: string, b: object) => Promise<any> }) {
  const token = (await Notifications.getExpoPushTokenAsync()).data;
  await api.post("/notifications/register", { platform: "expo", push_token: token });
}
