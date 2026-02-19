import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Tournament } from '@badminton/shared';
import ConfigForm from '../../components/ConfigForm';

const defaultConfig: Tournament = {
  courts: 3,
  mode: 'doubles',
  winPoints: 2,
  currentRound: 0,
  status: 'setup',
};

// Helper to get form controls by their label text (since labels lack htmlFor)
function getInputByLabel(container: HTMLElement, labelText: string): HTMLInputElement | HTMLSelectElement {
  const label = Array.from(container.querySelectorAll('label')).find(
    el => el.textContent?.trim() === labelText,
  );
  if (!label) throw new Error(`Label "${labelText}" not found`);
  const parent = label.parentElement!;
  const input = parent.querySelector('input, select');
  if (!input) throw new Error(`No input found for label "${labelText}"`);
  return input as HTMLInputElement | HTMLSelectElement;
}

describe('ConfigForm', () => {
  it('renders config values correctly', () => {
    const { container } = render(<ConfigForm config={defaultConfig} onChange={() => {}} />);

    const courtsInput = getInputByLabel(container, 'จำนวนสนาม');
    expect(courtsInput).toHaveValue(3);

    const modeSelect = getInputByLabel(container, 'โหมด') as HTMLSelectElement;
    expect(modeSelect.value).toBe('doubles');

    const winPointsInput = getInputByLabel(container, 'คะแนนเมื่อชนะ');
    expect(winPointsInput).toHaveValue(2);
  });

  it('calls onChange when fields change', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { container } = render(<ConfigForm config={defaultConfig} onChange={onChange} />);

    // Change mode to singles
    const modeSelect = getInputByLabel(container, 'โหมด');
    await user.selectOptions(modeSelect, 'singles');
    expect(onChange).toHaveBeenCalledWith({ mode: 'singles' });
  });

  it('disables fields when disabled prop is true', () => {
    const { container } = render(<ConfigForm config={defaultConfig} onChange={() => {}} disabled />);

    expect(getInputByLabel(container, 'จำนวนสนาม')).toBeDisabled();
    expect(getInputByLabel(container, 'โหมด')).toBeDisabled();
    expect(getInputByLabel(container, 'คะแนนเมื่อชนะ')).toBeDisabled();
  });
});
