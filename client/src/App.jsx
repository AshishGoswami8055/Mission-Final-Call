import { Navigate, Route, Routes } from "react-router-dom";
import DashboardPage from "./pages/DashboardPage";
import TelegramImportPage from "./pages/TelegramImportPage";
import MissionPage from "./pages/MissionPage";
import IntelligenceHistoryPage from "./pages/IntelligenceHistoryPage";
import HistoryPage from "./pages/HistoryPage";
import LoginPage from "./pages/LoginPage";
import OneWordSubstitutionPage from "./pages/OneWordSubstitutionPage";
import PaperViewerPage from "./pages/PaperViewerPage";
import PapersPage from "./pages/PapersPage";
import PdfViewerPage from "./pages/PdfViewerPage";
import ScreenshotViewerPage from "./pages/ScreenshotViewerPage";
import VideoPlayerPage from "./pages/VideoPlayerPage";
import VocabularyPage from "./pages/VocabularyPage";
import IdiomsPage from "./pages/IdiomsPage";
import { useAuth } from "./context/AuthContext";
import DocumentTitle from "./components/DocumentTitle";
import Loader from "./components/Loader";
import StudyCompleteCelebration from "./components/StudyCompleteCelebration";

const PrivateRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <Loader
        fullPage
        brand
        size="lg"
        label="Loading your workspace"
        subtitle="Preparing courses, subjects, and your study dashboard…"
      />
    );
  }
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

function App() {
  const { isAuthenticated } = useAuth();
  return (
    <>
    <DocumentTitle />
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <DashboardPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/import/telegram"
        element={
          <PrivateRoute>
            <TelegramImportPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/video/:id"
        element={
          <PrivateRoute>
            <VideoPlayerPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/video/:id/screenshot/:noteId"
        element={
          <PrivateRoute>
            <ScreenshotViewerPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/pdf/:id"
        element={
          <PrivateRoute>
            <PdfViewerPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/papers"
        element={
          <PrivateRoute>
            <PapersPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/paper/:id"
        element={
          <PrivateRoute>
            <PaperViewerPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/mission"
        element={
          <PrivateRoute>
            <MissionPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/history/intelligence"
        element={
          <PrivateRoute>
            <IntelligenceHistoryPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/history"
        element={
          <PrivateRoute>
            <HistoryPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/vocabulary"
        element={
          <PrivateRoute>
            <VocabularyPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/idioms"
        element={
          <PrivateRoute>
            <IdiomsPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/one-word-substitution"
        element={
          <PrivateRoute>
            <OneWordSubstitutionPage />
          </PrivateRoute>
        }
      />
    </Routes>
    <StudyCompleteCelebration />
    </>
  );
}

export default App;
