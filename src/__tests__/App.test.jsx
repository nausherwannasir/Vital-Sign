import React from 'react';
import { render, screen } from '@testing-library/react';
import App from '../App';

// Lets a test simulate the camera failing to start.
let mockCameraError = null;

jest.mock('../components/VideoFeed', () => {
  const ReactMock = require('react');
  return {
    __esModule: true,
    default: function MockVideoFeed({ onError }) {
      ReactMock.useEffect(() => {
        if (mockCameraError) onError?.(mockCameraError);
      }, [onError]);
      return ReactMock.createElement('div', { 'data-testid': 'video-feed' });
    },
  };
});

jest.mock('../hooks/useRPPG', () => ({
  __esModule: true,
  default: () => ({
    bpm: 72,
    quality: 'Good signal',
    lighting: 'Good lighting',
    isProcessing: false,
    signalStrength: 45,
    bufferSize: 120,
    maxBufferSize: 150,
    processFrame: jest.fn(),
    reset: jest.fn(),
  }),
}));

describe('App Component', () => {
  beforeEach(() => {
    mockCameraError = null;
  });

  it('renders without crashing', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /vital signs/i })).toBeInTheDocument();
  });

  it('renders video section and subtitle', () => {
    render(<App />);
    expect(screen.getByTestId('video-feed')).toBeInTheDocument();
    expect(screen.getByText(/contactless heart rate monitor/i)).toBeInTheDocument();
  });

  it('does not show a camera error by default', () => {
    render(<App />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('surfaces a camera error reported by the video feed', () => {
    mockCameraError = 'No camera was found on this device.';
    render(<App />);
    expect(screen.getByRole('alert')).toHaveTextContent(/no camera was found/i);
  });
});
