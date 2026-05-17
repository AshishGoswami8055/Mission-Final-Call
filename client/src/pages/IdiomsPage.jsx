import LanguageLearningPage from "../components/LanguageLearningPage";

const IdiomsPage = () => (
  <LanguageLearningPage
    itemType="idiom"
    title="Idioms Practice"
    subtitle="Learn common idioms with meaning and usage examples."
    addButtonLabel="Add Idiom"
    termLabel="Idiom"
    meaningLabel="Meaning"
    exampleLabel="Usage"
    emptyText="No idioms found"
  />
);

export default IdiomsPage;
