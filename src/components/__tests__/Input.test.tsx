import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input, Textarea, Select, Field } from '../ui/Input';

describe('Input', () => {
  it('renders an input with the base styling', () => {
    render(<Input placeholder="Enter IOC" />);
    const input = screen.getByPlaceholderText('Enter IOC');
    expect(input.tagName).toBe('INPUT');
    expect(input.className).toContain('rounded-xl');
    expect(input.className).toContain('focus:border-brand-500');
  });

  it('applies monospace font by default', () => {
    render(<Input />);
    expect(document.querySelector('input')?.className).toContain('font-mono');
  });

  it('disables monospace when mono={false}', () => {
    render(<Input mono={false} />);
    expect(document.querySelector('input')?.className).not.toContain('font-mono');
  });

  it('accepts standard input attributes', () => {
    render(<Input type="text" value="1.2.3.4" readOnly />);
    expect(screen.getByDisplayValue('1.2.3.4')).toBeInTheDocument();
  });

  it('merges custom className', () => {
    render(<Input className="max-w-md" />);
    expect(document.querySelector('input')?.className).toContain('max-w-md');
  });

  it('calls onChange when typed in', async () => {
    const onChange = vi.fn();
    render(<Input onChange={onChange} placeholder="test" />);
    await userEvent.type(screen.getByPlaceholderText('test'), 'a');
    expect(onChange).toHaveBeenCalled();
  });
});

describe('Textarea', () => {
  it('renders a textarea with base styling', () => {
    render(<Textarea rows={5} placeholder="Bulk IOCs" />);
    const ta = screen.getByPlaceholderText('Bulk IOCs');
    expect(ta.tagName).toBe('TEXTAREA');
    expect(ta.className).toContain('rounded-xl');
  });

  it('applies monospace by default', () => {
    render(<Textarea />);
    expect(document.querySelector('textarea')?.className).toContain('font-mono');
  });
});

describe('Select', () => {
  it('renders a select with options', () => {
    render(
      <Select defaultValue="single">
        <option value="single">Single</option>
        <option value="bulk">Bulk</option>
      </Select>
    );
    expect(screen.getByDisplayValue('Single')).toBeInTheDocument();
  });
});

describe('Field', () => {
  it('renders label + children + hint', () => {
    render(
      <Field label="IOC" hint="IP, domain, URL, or hash">
        <Input />
      </Field>
    );
    expect(screen.getByText('IOC')).toBeInTheDocument();
    expect(screen.getByText('IP, domain, URL, or hash')).toBeInTheDocument();
  });

  it('renders error instead of hint when error is set', () => {
    render(
      <Field label="IOC" hint="hint text" error="Invalid format">
        <Input />
      </Field>
    );
    expect(screen.getByText('Invalid format')).toBeInTheDocument();
    expect(screen.queryByText('hint text')).toBeNull();
  });

  it('gives the error role="alert"', () => {
    render(
      <Field label="IOC" error="Required">
        <Input />
      </Field>
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
