# Contributing to Vital-Sign

Thank you for your interest in contributing to Vital-Sign! This document provides guidelines and instructions for contributing.

## Code of Conduct

We are committed to providing a welcoming and inclusive environment. Please be respectful and constructive in all interactions.

## How to Contribute

### Reporting Bugs

1. Check if the bug already exists in [Issues](https://github.com/nausherwannasir/Vital-Sign/issues)
2. If not, create a new issue with:
   - Clear description of the bug
   - Steps to reproduce
   - Expected vs actual behavior
   - Your environment (OS, browser, Python version)
   - Screenshots or error logs if applicable

### Suggesting Features

1. Check existing [Issues](https://github.com/nausherwannasir/Vital-Sign/issues) and [Discussions](https://github.com/nausherwannasir/Vital-Sign/discussions)
2. Create an issue with:
   - Clear description of the feature
   - Use cases and benefits
   - Proposed implementation approach (if you have ideas)

### Submitting Code Changes

#### Setup Development Environment

```bash
# Clone your fork
git clone https://github.com/YOUR-USERNAME/Vital-Sign.git
cd Vital-Sign

# Create a virtual environment and install dev dependencies
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements-dev.txt

# Install frontend dev dependencies
cd ../my-vitals-ui
npm install
```

#### Development Workflow

1. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes:**
   - Keep changes focused and atomic
   - Write descriptive commit messages
   - Follow code style guidelines (see below)

3. **Test your changes:**
   ```bash
   # Backend tests
   cd backend
   pytest tests/ -v --cov=.
   
   # Frontend tests
   cd ../my-vitals-ui
   npm test
   ```

4. **Format your code:**
   ```bash
   # Backend
   cd backend
   black .
   flake8 .
   
   # Frontend
   cd ../my-vitals-ui
   npm run format
   npm run lint:fix
   ```

5. **Commit your changes:**
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

6. **Push to your fork:**
   ```bash
   git push origin feature/your-feature-name
   ```

7. **Create a Pull Request:**
   - Provide a clear title and description
   - Reference any related issues
   - Describe your changes and their impact
   - Include any testing performed

#### Pull Request Guidelines

- One feature per PR
- PR description should explain the "why" and "what"
- All checks must pass (tests, linting, builds)
- Request reviews from maintainers
- Be open to feedback and iterate

## Code Style Guidelines

### Python

We use **Black** for formatting and **Flake8** for linting.

```bash
# Format code
black backend/

# Check linting
flake8 backend/
```

**Style guidelines:**
- Line length: 100 characters
- Use type hints where possible
- Add docstrings to functions and classes
- Use descriptive variable names
- Follow PEP 8

### JavaScript/React

We use **Prettier** for formatting and **ESLint** for linting.

```bash
# Format code
cd my-vitals-ui
npm run format

# Fix linting issues
npm run lint:fix
```

**Style guidelines:**
- Use functional components with hooks
- Add PropTypes for component props
- Use meaningful variable names
- Keep components focused and reusable
- Add comments for complex logic

## Testing Requirements

### Backend

```bash
cd backend

# Run all tests
pytest tests/ -v

# Run with coverage
pytest tests/ --cov=. --cov-report=html

# Run specific test file
pytest tests/test_app.py -v

# Run specific test
pytest tests/test_app.py::test_health_check -v
```

### Frontend

```bash
cd my-vitals-ui

# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run in watch mode
npm run test:watch
```

**Test requirements:**
- Aim for >80% code coverage
- Test happy paths and error cases
- Test edge cases
- Mock external dependencies
- Use descriptive test names

## Commit Message Format

Follow conventional commits format:

```
type(scope): subject

body

footer
```

**Types:**
- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Build process, dependencies, etc.

**Examples:**
```
feat(signal-processing): add heart rate variability detection

fix(api): handle edge case for short signals

docs: update deployment guide

test(frontend): add VideoFeed component tests
```

## Documentation

- Update README.md if your changes affect user-facing features
- Add/update docstrings in code
- Update API_DOCUMENTATION.md for API changes
- Add comments for complex logic

## Project Structure

```
Vital-Sign/
├── backend/
│   ├── app.py              # Main Flask application
│   ├── config.py           # Configuration
│   ├── requirements.txt     # Production dependencies
│   ├── requirements-dev.txt # Development dependencies
│   └── tests/              # Test suite
├── my-vitals-ui/           # React frontend
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   ├── hooks/
│   │   └── ...
│   ├── package.json
│   └── tests/
└── frontend/               # Classic HTML/JS interface
```

## Getting Help

- **Questions?** Open a [Discussion](https://github.com/nausherwannasir/Vital-Sign/discussions)
- **Documentation issues?** Check [docs](/docs)
- **Found a bug?** [Create an issue](https://github.com/nausherwannasir/Vital-Sign/issues)
- **Need help?** Ask in [Discussions](https://github.com/nausherwannasir/Vital-Sign/discussions)

## License

By contributing to Vital-Sign, you agree that your contributions will be licensed under its MIT License.

Thank you for contributing to Vital-Sign! 🎉
