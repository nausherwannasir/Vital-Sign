import React from 'react';
import { render, screen } from '@testing-library/react';
import App from '../App';

jest.mock('../components/VideoFeed', () => function MockVideoFeed() {
  return <div data-testid="video-feed" />;
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
  it('renders without crashing', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /vital signs/i })).toBeInTheDocument();
  });

  it('renders video section and subtitle', () => {
    render(<App />);
    expect(screen.getByTestId('video-feed')).toBeInTheDocument();
    expect(screen.getByText(/contactless heart rate monitor/i)).toBeInTheDocument();
  });
});
