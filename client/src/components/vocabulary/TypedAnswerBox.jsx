import { FiCornerDownLeft } from "react-icons/fi";

const TypedAnswerBox = ({ value, disabled, onChange, onSubmit }) => (
  <form
    className="flex flex-col gap-3 sm:flex-row"
    onSubmit={(event) => {
      event.preventDefault();
      if (value.trim()) onSubmit();
    }}
  >
    <input
      autoFocus
      className="input min-h-12 flex-1 text-base"
      placeholder="Type the exact word…"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
    <button type="submit" className="btn-primary min-h-12 px-5" disabled={disabled || !value.trim()}>
      Submit <FiCornerDownLeft />
    </button>
  </form>
);

export default TypedAnswerBox;
