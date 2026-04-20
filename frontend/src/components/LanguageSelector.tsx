import { SelectPicker } from "rsuite";
import { LANGUAGES } from "../config/languages";
import { t } from "../config/i18n/index";

type Props = {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
};

export function LanguageSelector({ value, onChange, disabled }: Props) {
  const data = LANGUAGES.map((lang) => ({
    value: lang.code,
    label: `${lang.label} (${lang.nativeLabel})`,
  }));

  return (
    <SelectPicker
      data={data}
      value={value}
      onChange={(v) => v && onChange(v)}
      disabled={disabled}
      cleanable={false}
      searchable={false}
      placement="bottomStart"
      placeholder={t(value, "language")}
      block
    />
  );
}
