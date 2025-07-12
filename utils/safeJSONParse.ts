import { jsonrepair } from 'jsonrepair';

export const safeJSONParse = (text: string, fallback = null) => {
  try {
    return JSON.parse(text);
  } catch {
    try {
      const repaired = jsonrepair(text);
      return JSON.parse(repaired);
    } catch {
      return fallback;
    }
  }
};
