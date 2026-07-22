import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

if (!getApps().length) {
  initializeApp();
}

export const db = getFirestore();
export { FieldValue };

/** Default Cloud Storage bucket for the project. */
export function bucket() {
  return getStorage().bucket();
}
