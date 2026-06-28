import { render, screen } from '@testing-library/react';
import { SettingsTab } from '../SettingsTab';
import { defaultSettings } from '../../types';

const noop = jest.fn();

const baseProps = {
  settings: defaultSettings,
  availableModels: ['gpt-4o', 'gpt-4o-mini'],
  isBusy: false,
  feedback: '',
  onFieldChange: noop,
  onSave: noop,
  onTestLlm: noop,
  onTestJira: noop,
};

describe('SettingsTab — LLM section', () => {
  it('renders without crashing', () => {
    render(<SettingsTab {...baseProps} section="llm" />);
    expect(screen.getByText('LLM Settings')).toBeTruthy();
  });

  it('renders Save and Test connection buttons', () => {
    render(<SettingsTab {...baseProps} section="llm" />);
    expect(screen.getByText('Save')).toBeTruthy();
    expect(screen.getByText('Test connection')).toBeTruthy();
  });

  it('disables Save when isBusy', () => {
    render(<SettingsTab {...baseProps} section="llm" isBusy={true} />);
    const saveBtn = screen.getByText('Save') as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  it('renders feedback text', () => {
    render(<SettingsTab {...baseProps} section="llm" feedback="Settings saved." />);
    expect(screen.getByText('Settings saved.')).toBeTruthy();
  });
});

describe('SettingsTab — Jira section', () => {
  it('renders without crashing', () => {
    render(<SettingsTab {...baseProps} section="jira" />);
    expect(screen.getByText('Jira & Xray')).toBeTruthy();
  });

  it('renders Jira connection fields', () => {
    render(<SettingsTab {...baseProps} section="jira" />);
    expect(screen.getByLabelText(/Jira URL/i)).toBeTruthy();
    expect(screen.getByLabelText(/Jira Email/i)).toBeTruthy();
  });
});
