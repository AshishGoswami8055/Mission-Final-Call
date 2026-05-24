import Layout from "../components/Layout";
import MissionDashboard from "../components/mission/MissionDashboard";

const MissionPage = () => (
  <Layout
    title="Today's Target"
    subtitle="AI-powered daily plan — English, Maths, GS, and structured reading for CDS (II) 2026"
    showSearch={false}
  >
    <MissionDashboard />
  </Layout>
);

export default MissionPage;
