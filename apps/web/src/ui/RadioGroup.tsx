interface RadioGroupProps<T extends string> {
  readonly legend: string;
  readonly name: string;
  /** `lang` marks a label written in another language, such as a language's own name. */
  readonly options: readonly { value: T; label: string; lang?: string }[];
  readonly value: T;
  readonly onChange: (value: T) => void;
}

/** A labelled set of native radio buttons: arrow keys and screen readers work out of the box. */
export function RadioGroup<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
}: RadioGroupProps<T>) {
  return (
    <fieldset className="radio-group">
      <legend>{legend}</legend>
      {options.map((option) => (
        <label key={option.value} lang={option.lang}>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => {
              onChange(option.value);
            }}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}
