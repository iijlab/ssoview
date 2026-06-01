/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

type LogoHeaderProps = {
  onClick?: () => void;
};

export function LogoHeader({ onClick }: LogoHeaderProps) {
  return (
    <div>
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          onClick?.();
        }}
        className="text-4xl font-extrabold tracking-tight"
      >
        SSOView
      </a>
    </div>
  );
}
