import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API } from "./config";

export const api = axios.create({ baseURL: API });

let inMemoryToken = null;

export async function setToken(token) {
  inMemoryToken = token;
  if (token) await AsyncStorage.setItem("everkin_token", token);
  else await AsyncStorage.removeItem("everkin_token");
}

export async function loadToken() {
  inMemoryToken = await AsyncStorage.getItem("everkin_token");
  return inMemoryToken;
}

api.interceptors.request.use((config) => {
  if (inMemoryToken) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${inMemoryToken}`;
  }
  return config;
});

export function errMsg(detail, fallback = "Something went wrong") {
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((e) => e?.msg || JSON.stringify(e)).join(" ");
  return detail?.msg || fallback;
}
