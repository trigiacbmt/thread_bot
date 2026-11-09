// Thông tin hiển thị trên trang Privacy / Data deletion.
export const legal = {
  get appName() { return process.env.APP_NAME || "Threads Bot"; },
  /** Email liên hệ hiển thị công khai (đặt CONTACT_EMAIL trong .env). */
  get contact() { return process.env.CONTACT_EMAIL || ""; },
  updated: "2026-11-09",
};
