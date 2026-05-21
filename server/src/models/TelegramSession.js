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
  },
  { timestamps: true }
);

const TelegramSession = mongoose.model("TelegramSession", telegramSessionSchema);

export default TelegramSession;
