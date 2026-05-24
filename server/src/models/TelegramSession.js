import mongoose from "mongoose";

const telegramSessionSchema = new mongoose.Schema(
  {
    stringSession: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    /** Separates localhost vs Render so both can use Telegram without AUTH_KEY_DUPLICATED. */
    deploymentKey: {
      type: String,
      default: "local",
      trim: true,
      index: true,
    },
  },
  { timestamps: true }
);

const TelegramSession = mongoose.model("TelegramSession", telegramSessionSchema);

export default TelegramSession;
