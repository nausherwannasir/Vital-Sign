import { render, screen } from '@testing-library/react';
import App from '../App';

describe('App Component', () => {
  it('renders without crashing', () => {
    render(<App />);
    expect(screen.getByRole('heading')).toBeDefined();
  });

  it('has title containing Vital', () => {
    render(<App />);
    const headings = screen.getAllByRole('heading');
    const hasVitalText = headings.some((h) => h.textContent.includes('Vital'));
    expect(hasVitalText || document.title.includes('Vital')).toBeTruthy();
  });
});
