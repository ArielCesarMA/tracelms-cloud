import { render, screen } from '@testing-library/react';
import { RequirementsTab } from '../RequirementsTab';
import type { ExtractedRequirement } from '../../types';

const noop = jest.fn();

const baseProps = {
  activeProjectId: null,
  activeProjectName: null,
  onGoToProjects: noop,
  selectedProvider: 'OpenAI',
  uploadedRequirements: [] as ExtractedRequirement[],
  jiraRequirements: [] as ExtractedRequirement[],
  instructionText: '',
  manualText: '',
  requirementsReviewed: false,
  generationProgress: '',
  uploadDrafts: [],
  jiraMode: 'single' as const,
  singleIssueKey: '',
  multipleIssueKeys: '',
  epicKey: '',
  storyQuery: '',
  storyOptions: [],
  selectedStoryKeys: [],
  isBusy: false,
  feedback: '',
  onInstructionTextChange: noop,
  onManualTextChange: noop,
  onReviewedChange: noop,
  onGenerateAll: noop,
  onClearAll: noop,
  onFileChange: noop,
  onParseFiles: noop,
  onRequirementUpdate: noop,
  onRequirementDelete: noop,
  onJiraRequirementUpdate: noop,
  onJiraRequirementDelete: noop,
  onJiraModeChange: noop,
  onSingleKeyChange: noop,
  onMultipleKeysChange: noop,
  onEpicKeyChange: noop,
  onStoryQueryChange: noop,
  onSearchStories: noop,
  onToggleStoryKey: noop,
  onPullJira: noop,
  documentWarnings: [] as string[],
  onDismissWarnings: noop,
};

const sampleReq: ExtractedRequirement = {
  reqId: 'REQ-001',
  summary: 'User can log in',
  description: 'The system shall allow users to authenticate.',
  issueType: 'Story',
  requirementType: 'Functional',
  priority: 'High',
  source: 'upload',
};

describe('RequirementsTab', () => {
  it('renders without crashing', () => {
    render(<RequirementsTab {...baseProps} />);
    expect(screen.getByText('Requirements')).toBeTruthy();
  });

  it('renders Generate All Artifacts button', () => {
    render(<RequirementsTab {...baseProps} />);
    expect(screen.getByText('⚡ Generate All Artifacts')).toBeTruthy();
  });

  it('shows staged upload draft chips when files are selected', () => {
    render(<RequirementsTab
      {...baseProps}
      uploadDrafts={[{ name: 'spec.pdf', mimeType: 'application/pdf', contentBase64: '' }]}
    />);
    expect(screen.getByText('spec.pdf')).toBeTruthy();
  });

  it('renders RequirementTable with 6 columns when uploadedRequirements are present', () => {
    render(<RequirementsTab {...baseProps} uploadedRequirements={[sampleReq]} />);
    expect(screen.getByText('REQ-001')).toBeTruthy();
    expect(screen.getByText('User can log in')).toBeTruthy();
    // Column headers
    expect(screen.getByText('Req ID')).toBeTruthy();
    expect(screen.getByText('Issue Type')).toBeTruthy();
    expect(screen.getByText('Priority')).toBeTruthy();
  });

  it('renders source badge chip on requirement row', () => {
    render(<RequirementsTab {...baseProps} uploadedRequirements={[sampleReq]} />);
    expect(screen.getByText('upload')).toBeTruthy();
  });

  it('renders jira source badge for jira requirements', () => {
    render(<RequirementsTab {...baseProps} jiraRequirements={[{ ...sampleReq, reqId: 'PROJ-1', source: 'jira' }]} />);
    expect(screen.getByText('jira')).toBeTruthy();
  });

  it('renders Extract Requirements button with correct label when no reqs extracted', () => {
    render(<RequirementsTab {...baseProps} uploadDrafts={[{ name: 'a.txt', mimeType: 'text/plain', contentBase64: '' }]} />);
    expect(screen.getByText('Extract Requirements')).toBeTruthy();
  });

  it('renders Re-extract label when requirements already exist', () => {
    render(<RequirementsTab {...baseProps} uploadedRequirements={[sampleReq]} uploadDrafts={[{ name: 'a.txt', mimeType: 'text/plain', contentBase64: '' }]} />);
    expect(screen.getByText('Re-extract')).toBeTruthy();
  });

  it('renders feedback text', () => {
    render(<RequirementsTab {...baseProps} feedback="Extracting requirements from files…" />);
    expect(screen.getByText('Extracting requirements from files…')).toBeTruthy();
  });

  it('shows stepper when generationProgress is phase1', () => {
    render(<RequirementsTab {...baseProps} generationProgress="phase1" />);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  // ── T-06: Image upload tests ──────────────────────────────────────────────

  it('renders image chip with file name when image file is staged', () => {
    render(<RequirementsTab
      {...baseProps}
      uploadDrafts={[{ name: 'screenshot.png', mimeType: 'image/png', contentBase64: '', isImage: true }]}
    />);
    expect(screen.getByText('screenshot.png')).toBeTruthy();
  });

  it('shows vision warning when Groq is selected and images are staged', () => {
    render(<RequirementsTab
      {...baseProps}
      selectedProvider="Groq"
      uploadDrafts={[{ name: 'req.png', mimeType: 'image/png', contentBase64: '', isImage: true }]}
    />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText(/does not support image analysis/i)).toBeTruthy();
  });

  it('does not show vision warning when OpenAI is selected with images staged', () => {
    render(<RequirementsTab
      {...baseProps}
      selectedProvider="OpenAI"
      uploadDrafts={[{ name: 'req.png', mimeType: 'image/png', contentBase64: '', isImage: true }]}
    />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows size error message on chip when image exceeds 10MB', () => {
    const errMsg = 'Image too large — maximum 10MB. Try compressing or cropping.';
    render(<RequirementsTab
      {...baseProps}
      uploadDrafts={[{ name: 'huge.png', mimeType: 'image/png', contentBase64: '', isImage: true, sizeError: errMsg }]}
    />);
    expect(screen.getByText(errMsg)).toBeTruthy();
  });

  it('does not show vision warning when only document files are staged', () => {
    render(<RequirementsTab
      {...baseProps}
      selectedProvider="Groq"
      uploadDrafts={[{ name: 'spec.pdf', mimeType: 'application/pdf', contentBase64: '' }]}
    />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
