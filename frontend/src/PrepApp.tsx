import "./App.css";
import PreparationPage from "./pages/PreparationPage";

/** Root for the preparation screen at /prep — the app frame, with no tab bar or office pages. */
export default function PrepApp() {
  return (
    <div className="app-frame">
      <div className="app-frame__body app-frame__body--prep">
        <PreparationPage />
      </div>
    </div>
  );
}
