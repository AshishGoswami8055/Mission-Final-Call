import mongoose from "mongoose";

const telegramChannelMappingSchema = new mongoose.Schema(
  {
    channelId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    channelTitle: {
      type: String,
      default: "",
      trim: true,
    },
    programmeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Programme",
      required: true,
      index: true,
    },
    autoSync: {
      type: Boolean,
      default: true,
    },
    lastSyncedMessageId: {
      type: Number,
      default: 0,
    },
    lastSyncedAt: {
      type: Date,
      default: null,
    },
    totalImported: {
      type: Number,
      default: 0,
    },
    /** Forum topic IDs the user chose to import/sync (empty = sync nothing). */
    syncTopicIds: {
      type: [Number],
      default: [],
    },
  },
  { timestamps: true }
);

telegramChannelMappingSchema.index({ channelId: 1, programmeId: 1 }, { unique: true });

const TelegramChannelMapping = mongoose.model("TelegramChannelMapping", telegramChannelMappingSchema);

export default TelegramChannelMapping;
