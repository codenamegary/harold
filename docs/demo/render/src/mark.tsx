export const Mark: React.FC<{ size?: number }> = ({ size = 64 }) => {
  return (
    <svg width={size} height={size} viewBox="0 0 108 108" fill="none">
      <path
        fill="#B6F36B"
        d="M27,0 L81,0 A27,27 0 0 1 108,27 L108,81 A27,27 0 0 1 81,108 L27,108 A27,27 0 0 1 0,81 L0,27 A27,27 0 0 1 27,0 Z"
      />
      <path
        fill="#10150C"
        d="M36,26 L52,26 L47,48 L65,48 L70,26 L86,26 L74,82 L58,82 L63,60 L45,60 L40,82 L24,82 Z"
      />
    </svg>
  )
}
