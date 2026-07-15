"use server";

import { cookies } from "next/headers";

export async function verifyDeveloperKey(key: string) {
  const expectedKey = process.env.DEVELOPER_KEY;
  
  if (!expectedKey) {
    console.error("DEVELOPER_KEY environment variable is not set.");
    return { success: false, error: "System configuration error. Please contact the developer." };
  }

  if (key === expectedKey) {
    const cookieStore = await cookies();
    cookieStore.set("echofind_dev_access", "true", {
      maxAge: 30 * 24 * 60 * 60, // 30 days
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
    return { success: true };
  }

  return { success: false, error: "Invalid developer key." };
}
