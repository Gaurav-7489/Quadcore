import './VoiceButton.css';

export default function VoiceButton({ isListening, status, onClick }) {
  return (
    <button
      id="voice-btn"
      className={`voice-button ${isListening ? 'voice-button--listening' : ''} ${status === 'speaking' ? 'voice-button--speaking' : ''}`}
      onClick={onClick}
      aria-label={isListening ? 'Stop listening' : 'Start voice command'}
    >
      {isListening && (
        <>
          <span className="voice-ring voice-ring--1"></span>
          <span className="voice-ring voice-ring--2"></span>
          <span className="voice-ring voice-ring--3"></span>
        </>
      )}
      <span className="voice-button__icon">
        {status === 'speaking' ? '🔊' : isListening ? '👂' : '🎤'}
      </span>
      <span className="voice-button__label">
        {status === 'speaking' ? 'Speaking...' : isListening ? 'Listening...' : 'Tap to Speak'}
      </span>
    </button>
  );
}
