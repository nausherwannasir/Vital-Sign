import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Dashboard from '../components/Dashboard';

describe('Dashboard Component', () => {
  const makeRppgData = (overrides = {}) => ({
    bpm: 72,
    quality: 'Good signal',
    lighting: 'Good lighting',
    isProcessing: false,
    signalStrength: 62,
    bufferSize: 100,
    maxBufferSize: 150,
    reset: jest.fn(),
    ...overrides,
  });

  it('renders core metrics and status fields', () => {
    render(<Dashboard rppgData={makeRppgData()} />);
    expect(screen.getByText(/heart rate/i)).toBeInTheDocument();
    expect(screen.getByText(/72/)).toBeInTheDocument();
    expect(screen.getByText(/good signal/i)).toBeInTheDocument();
    expect(screen.getByText(/^Good lighting$/i)).toBeInTheDocument();
  });

  it('shows placeholder heart rate when no bpm is available', () => {
    render(<Dashboard rppgData={makeRppgData({ bpm: null })} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('calls reset when reset button is clicked', () => {
    const reset = jest.fn();
    render(<Dashboard rppgData={makeRppgData({ reset })} />);
    fireEvent.click(screen.getByRole('button', { name: /reset measurement/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
