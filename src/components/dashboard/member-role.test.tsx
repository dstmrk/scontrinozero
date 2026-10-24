// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemberRoleProvider, useIsCollaborator } from "./member-role";

function Probe() {
  return <span>{useIsCollaborator() ? "collaboratore" : "titolare"}</span>;
}

describe("MemberRoleProvider", () => {
  it("espone il collaboratore ai componenti sotto il provider", () => {
    render(
      <MemberRoleProvider role="collaborator">
        <Probe />
      </MemberRoleProvider>,
    );
    expect(screen.getByText("collaboratore")).toBeInTheDocument();
  });

  it("espone il titolare", () => {
    render(
      <MemberRoleProvider role="owner">
        <Probe />
      </MemberRoleProvider>,
    );
    expect(screen.getByText("titolare")).toBeInTheDocument();
  });

  it("senza provider il componente si comporta come per il titolare", () => {
    render(<Probe />);
    expect(screen.getByText("titolare")).toBeInTheDocument();
  });
});
