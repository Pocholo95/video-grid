import {
  PROJECT_URL,
  AUTHOR_URL,
  AUTHOR_NAME,
  PROJECT_NAME,
} from "../constants";

export default function Footer() {
  return (
    <footer className="app-footer">
      <span>
        {PROJECT_NAME} v{__APP_VERSION__}
      </span>
      <span className="footer-sep">·</span>
      <span>
        <a
          href={PROJECT_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="View project on GitLab"
        >
          Source Code
        </a>
      </span>
      <span className="footer-sep">·</span>
      <span>
        by{" "}
        <a href={AUTHOR_URL} target="_blank" rel="noopener noreferrer">
          {AUTHOR_NAME}
        </a>
      </span>
    </footer>
  );
}
