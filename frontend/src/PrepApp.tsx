import "./App.css";
import PrepPage from "./pages/PrepPage";

/** Root for the preparers' screen at /prep — the same app frame, with no tab bar or office pages. */
export default function PrepApp() {
  return (
    <div className="app-frame">
      <div className="app-frame__body app-frame__body--prep">
        <PrepPage />
      </div>
    </div>
  );
}
