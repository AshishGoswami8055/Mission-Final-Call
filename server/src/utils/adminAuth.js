/** Admin signup / env-seed helpers. No DB imports — unit-tested. */

export const envEnabled = (name) => {
  const value = String(process.env[name] || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
};

/** Extra admins may create their own email/password (friend's machine, or DEMO_MODE). */
export const isAdminSignupAllowed = () => envEnabled("ALLOW_ADMIN_SIGNUP") || envEnabled("DEMO_MODE");

/** Update password/name for ADMIN_EMAIL on boot when that user already exists. */
export const isAdminEnvSyncEnabled = () => envEnabled("ADMIN_SYNC") || envEnabled("DEMO_MODE");

export const normalizeAdminEmail = (email) => String(email || "").toLowerCase().trim();

export const validateAdminPassword = (password) => {
  const value = String(password || "");
  if (value.length < 8) return "Password must be at least 8 characters";
  return null;
};

export const publicAdmin = (admin) => ({
  id: admin._id,
  email: admin.email,
  name: admin.name,
});
