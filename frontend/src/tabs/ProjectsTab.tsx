import { memo } from 'react';

export const ProjectsTab = memo(function ProjectsTab(): JSX.Element {
  return (
    <section className="panel">
      <h2>Projects</h2>
      <p className="helper-text">
        Organise your generation runs into named projects. Each project maps to a Jira project,
        stores stakeholder contacts, and will support an automated test case approval workflow.
      </p>

      <div className="coming-soon-block">
        <div className="coming-soon-icon-lg">📁</div>
        <h3>Coming Soon</h3>
        <p>Projects will include:</p>
        <ul className="coming-soon-list">
          <li>Project name, key, description, and Jira project mapping</li>
          <li>Owner and stakeholder email list</li>
          <li>Generation history per project (linked runs)</li>
          <li>Project status — Draft, Active, Archived</li>
          <li>Automated approval workflow for test cases via stakeholder email</li>
        </ul>
        <p className="coming-soon-note-text">
          Requires the Supabase storage layer to be fully connected. Schema is already migrated —
          the UI and API routes are the next phase.
        </p>
      </div>
    </section>
  );
});
