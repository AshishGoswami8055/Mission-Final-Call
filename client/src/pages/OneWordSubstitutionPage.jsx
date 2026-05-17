import LanguageLearningPage from "../components/LanguageLearningPage";

const OneWordSubstitutionPage = () => (
  <LanguageLearningPage
    itemType="one_word"
    title="One Word Substitution"
    subtitle="Practice replacing long phrases with precise single words."
    addButtonLabel="Add One-Word Item"
    termLabel="Phrase"
    meaningLabel="One-word substitution"
    exampleLabel="Context"
    emptyText="No one-word substitutions found"
  />
);

export default OneWordSubstitutionPage;
