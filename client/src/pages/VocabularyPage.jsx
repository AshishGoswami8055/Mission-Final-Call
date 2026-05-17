import LanguageLearningPage from "../components/LanguageLearningPage";

const VocabularyPage = () => (
  <LanguageLearningPage
    itemType="vocabulary"
    title="Vocabulary Builder"
    subtitle="Build strong word power for CDS with daily revision."
    addButtonLabel="Add Word"
    termLabel="Word"
    meaningLabel="Meaning"
    exampleLabel="Example sentence"
    emptyText="No vocabulary found"
  />
);

export default VocabularyPage;
