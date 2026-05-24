import Layout from "../components/Layout";
import MissionDashboard from "../components/mission/MissionDashboard";

const MissionPage = () => (
  <Layout
    title="Today's Target"
    subtitle="Daily mission command center — discipline, consistency, exam readiness"
    showSearch={false}
  >
    <MissionDashboard />
  </Layout>
);

export default MissionPage;
