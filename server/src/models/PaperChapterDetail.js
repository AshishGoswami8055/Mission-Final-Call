import mongoose from "mongoose";

const topicSchema = new mongoose.Schema(
  { topicName: String, questionNumbers: [String] },
  { _id: false }
);

const questionDetailSchema = new mongoose.Schema(
  {
    number: String,
    snippet: String,
    correctAnswer: String,
    explanation: String,
    subTopic: String,
  },
  { _id: false }
);

const paperChapterDetailSchema = new mongoose.Schema(
  {
    paperId: { type: mongoose.Schema.Types.ObjectId, ref: "Paper", required: true, index: true },
    subjectName: { type: String, required: true, index: true },
    chapterName: { type: String, required: true, index: true },
    topics: [topicSchema],
    questions: [questionDetailSchema],
    noQuestions: { type: Boolean, default: false },
    typicalTopics: [String],
    examIdentifier: String,
  },
  { timestamps: true }
);

paperChapterDetailSchema.index({ paperId: 1, subjectName: 1, chapterName: 1 }, { unique: true });

const PaperChapterDetail = mongoose.model("PaperChapterDetail", paperChapterDetailSchema);

export default PaperChapterDetail;
