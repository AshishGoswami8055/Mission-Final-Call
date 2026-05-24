import MissionStartPrompt from "./MissionStartPrompt";

const StartStudyGate = ({
  userName = "Cadet",
  dailyTarget,
  message,
  starting = false,
  onStartStudy,
}) => (
  <MissionStartPrompt
    userName={userName}
    dailyTarget={dailyTarget}
    starting={starting}
    onStartStudy={onStartStudy}
    showMissionLink
    intelligenceMode
  />
);

export default StartStudyGate;
