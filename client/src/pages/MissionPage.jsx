import Layout from "../components/Layout";
import MissionDashboard from "../components/mission/MissionDashboard";

const MissionPage = () => (
  <Layout
    title="Today's Target"
    subtitle="Daily plan — English, Maths, GS, and reading"
    showSearch={false}
  >
    <MissionDashboard />
  </Layout>
);

export default MissionPage;
