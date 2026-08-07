import LanguageLearningPage from "../components/LanguageLearningPage";

const VocabularyLearnPage = () => (
  <LanguageLearningPage
    itemType="vocabulary"
    title="Vocabulary Library"
    subtitle="Search, edit and organize the entries that power your CDS Vocabulary Arena."
    addButtonLabel="Add Word"
    termLabel="Word"
    meaningLabel="Meaning"
    exampleLabel="Example sentence"
    emptyText="No vocabulary found"
  />
);

export default VocabularyLearnPage;
