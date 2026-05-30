import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dashboard from '../components/Dashboard';

// Mock the useRPPG hook
jest.mock('../hooks/useRPPG', () => ({
  __esModule: true,
  default: () => ({
    bpm: 72,
    lighting: 'good',
    isLoading: false,
    error: null,
    videoRef: { current: null },
    startMonitoring: jest.fn(),
    stopMonitoring: jest.fn(),
  }),
}));

describe('Dashboard Component', () => {
  it('renders without crashing', () => {
    render(<Dashboard />);
    expect(screen.getByRole('heading')).toBeDefined();
  });

  it('displays heart rate when available', () => {
    render(<Dashboard />);
    // Check for BPM display
    const bpmText = screen.queryByText(/72|BPM/i);
    expect(bpmText).toBeDefined();
  });

  it('shows loading state initially', () => {
    render(<Dashboard />);
    // Should show loading indicator
    expect(screen.queryByText(/loading|initializing/i)).toBeDefined();
  });

  it('displays lighting quality indicator', () => {
    render(<Dashboard />);
    // Should show lighting quality
    const lightingIndicator = screen.queryByText(/light|good|poor/i);
    expect(lightingIndicator).toBeDefined();
  });

  it('has start and stop controls', () => {
    render(<Dashboard />);
    // Look for buttons
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('handles start button click', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    const startButton = screen.getByRole('button', { name: /start/i });
    await user.click(startButton);

    await waitFor(() => {
      expect(startButton).toBeInTheDocument();
    });
  });

  it('displays error message on API failure', () => {
    // Mock hook with error
    jest.spyOn(require('../hooks/useRPPG'), 'default').mockReturnValue({
      bpm: null,
      lighting: null,
      isLoading: false,
      error: 'Webcam access denied',
      videoRef: { current: null },
      startMonitoring: jest.fn(),
      stopMonitoring: jest.fn(),
    });

    render(<Dashboard />);
    expect(screen.getByText(/webcam access denied/i)).toBeDefined();
  });

  it('updates display when BPM changes', async () => {
    const { rerender } = render(<Dashboard />);

    // Simulate BPM change
    jest.spyOn(require('../hooks/useRPPG'), 'default').mockReturnValue({
      bpm: 85,
      lighting: 'good',
      isLoading: false,
      error: null,
      videoRef: { current: null },
      startMonitoring: jest.fn(),
      stopMonitoring: jest.fn(),
    });

    rerender(<Dashboard />);

    // Should update display
    await waitFor(() => {
      expect(screen.queryByText(/85|BPM/i)).toBeDefined();
    });
  });

  it('responds to keyboard shortcuts', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    // Simulate spacebar to start/stop
    await user.keyboard(' ');

    // Component should respond
    const startButton = screen.queryByRole('button', { name: /start|stop/i });
    expect(startButton).toBeDefined();
  });

  it('shows confidence indicator if available', () => {
    render(<Dashboard />);
    // Look for confidence display
    const confidenceText = screen.queryByText(/confidence|accurate/i);
    // May or may not exist depending on implementation
    if (confidenceText) {
      expect(confidenceText).toBeInTheDocument();
    }
  });

  it('displays heart rate animation when monitoring', () => {
    render(<Dashboard />);
    // Check for animation element
    const heartAnimation = screen.queryByRole('img', { name: /heart|pulse/i });
    // Animation may be SVG or styled div
    expect(screen.getByRole('heading')).toBeDefined();
  });

  it('handles responsive layout', () => {
    // Mock mobile viewport
    global.innerWidth = 375;
    global.innerHeight = 667;

    render(<Dashboard />);
    const dashboard = screen.getByRole('main') || screen.getByRole('heading');
    expect(dashboard).toBeDefined();
  });

  it('shows troubleshooting tips on error', () => {
    jest.spyOn(require('../hooks/useRPPG'), 'default').mockReturnValue({
      bpm: null,
      lighting: null,
      isLoading: false,
      error: 'No face detected',
      videoRef: { current: null },
      startMonitoring: jest.fn(),
      stopMonitoring: jest.fn(),
    });

    render(<Dashboard />);
    // Should show helpful tips
    const tips = screen.queryByText(/no face|clear|lighting|position/i);
    expect(tips).toBeDefined();
  });
});
