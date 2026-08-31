/** Voice: expo-speech TTS with the anxiety engine driving rate; hi-IN supported. */
import * as Speech from "expo-speech";
import { AnxietyEngine } from "../ai/anxiety";

export function speak(text: string, lang: "en" | "hi", ax: AnxietyEngine) {
  Speech.stop();
  Speech.speak(text, { language: lang === "hi" ? "hi-IN" : "en-IN", rate: ax.speechRate(), pitch: 1.0 });
}
export const stopSpeaking = () => Speech.stop();
