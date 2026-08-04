import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable, type DataTableColumn } from '../ui/DataTable';

interface Row {
  name: string;
  score: number;
  type: string;
}

const ROWS: Row[] = [
  { name: 'Charlie', score: 30, type: 'ip' },
  { name: 'Alice', score: 90, type: 'domain' },
  { name: 'Bob', score: 60, type: 'hash' },
];

const COLUMNS: DataTableColumn<Row>[] = [
  { key: 'name', header: 'Name', sortValue: (r) => r.name, render: (r) => r.name },
  { key: 'score', header: 'Score', sortValue: (r) => r.score, render: (r) => String(r.score), align: 'right' },
  { key: 'type', header: 'Type', render: (r) => r.type }, // non-sortable
];

describe('DataTable — rendering', () => {
  it('renders all rows', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.name} />);
    expect(screen.getByText('Charlie')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('renders all column headers', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.name} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Score')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
  });

  it('renders the empty state when rows is empty', () => {
    render(<DataTable columns={COLUMNS} rows={[]} rowKey={(r) => r.name} empty="No data" />);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('renders nothing in the body when rows is empty and no empty prop', () => {
    const { container } = render(<DataTable columns={COLUMNS} rows={[]} rowKey={(r) => r.name} />);
    expect(container.querySelectorAll('tbody tr').length).toBe(0);
  });
});

describe('DataTable — sorting', () => {
  it('clicking a sortable header sorts desc first (highest on top)', async () => {
    const user = userEvent.setup();
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.name} />);
    await user.click(screen.getByText('Score'));
    // desc: 90, 60, 30
    const cells = screen.getAllByText(/\d+/).filter((el) => el.tagName === 'TD');
    expect(cells[0]).toHaveTextContent('90');
    expect(cells[1]).toHaveTextContent('60');
    expect(cells[2]).toHaveTextContent('30');
  });

  it('clicking again toggles to asc', async () => {
    const user = userEvent.setup();
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.name} />);
    await user.click(screen.getByText('Score')); // desc
    await user.click(screen.getByText('Score')); // asc
    const cells = screen.getAllByText(/\d+/).filter((el) => el.tagName === 'TD');
    expect(cells[0]).toHaveTextContent('30');
    expect(cells[1]).toHaveTextContent('60');
    expect(cells[2]).toHaveTextContent('90');
  });

  it('clicking a third time clears the sort (back to input order)', async () => {
    const user = userEvent.setup();
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.name} />);
    await user.click(screen.getByText('Score')); // desc
    await user.click(screen.getByText('Score')); // asc
    await user.click(screen.getByText('Score')); // none
    // input order: Charlie(30), Alice(90), Bob(60)
    const cells = screen.getAllByText(/\d+/).filter((el) => el.tagName === 'TD');
    expect(cells[0]).toHaveTextContent('30');
    expect(cells[1]).toHaveTextContent('90');
    expect(cells[2]).toHaveTextContent('60');
  });

  it('sorts strings alphabetically', async () => {
    const user = userEvent.setup();
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.name} />);
    await user.click(screen.getByText('Name')); // desc
    // desc: Charlie, Bob, Alice
    const nameCells = screen.getAllByText(/Charlie|Bob|Alice/).filter((el) => el.tagName === 'TD');
    expect(nameCells[0]).toHaveTextContent('Charlie');
    expect(nameCells[1]).toHaveTextContent('Bob');
    expect(nameCells[2]).toHaveTextContent('Alice');
  });

  it('non-sortable columns do not have a sort button', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.name} />);
    // "Type" column is non-sortable — its header is plain text, not a button
    const typeHeader = screen.getByText('Type');
    expect(typeHeader.tagName).not.toBe('BUTTON');
  });

  it('respects initialSort prop', () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.name}
        initialSort={{ key: 'score', dir: 'desc' }}
      />
    );
    const cells = screen.getAllByText(/\d+/).filter((el) => el.tagName === 'TD');
    expect(cells[0]).toHaveTextContent('90'); // desc
  });
});

describe('DataTable — accessibility', () => {
  it('sets aria-sort on the active column header', async () => {
    const user = userEvent.setup();
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.name} />);
    await user.click(screen.getByText('Score'));
    const scoreHeader = screen.getByText('Score').closest('th');
    expect(scoreHeader?.getAttribute('aria-sort')).toBe('descending');
  });

  it('aria-sort is none on unsorted columns', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.name} />);
    const nameHeader = screen.getByText('Name').closest('th');
    expect(nameHeader?.getAttribute('aria-sort')).toBe('none');
  });

  it('all column headers have scope="col"', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.name} />);
    const headers = screen.getAllByRole('columnheader');
    for (const h of headers) {
      expect(h.getAttribute('scope')).toBe('col');
    }
  });
});

describe('DataTable — rowKey', () => {
  it('uses rowKey for React keys (stable identity)', () => {
    const { container } = render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r, i) => `${r.name}-${i}`} />);
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(3);
  });
});
