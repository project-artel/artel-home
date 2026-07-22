import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <section className="page">
      <div className="panel-message">
        <h1>Page not found</h1>
        <p className="panel-message-copy">
          That address does not match anything in the workspace.
        </p>
        <Link className="button button--secondary" to="/projects">Back to projects</Link>
      </div>
    </section>
  )
}
