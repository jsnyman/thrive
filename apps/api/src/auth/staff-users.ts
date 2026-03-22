import type { StaffUserRecord } from "./types";

type StaffUserReader = {
  staffUser: {
    findUnique: (args: {
      where: {
        username: string;
      };
    }) => Promise<StaffUserRecord | null>;
  };
};

export const getStaffUserByUsername = async (
  prisma: StaffUserReader,
  username: string,
): Promise<StaffUserRecord | null> => {
  const user = await prisma.staffUser.findUnique({
    where: {
      username,
    },
  });
  if (user === null) {
    return null;
  }
  return {
    id: user.id,
    username: user.username,
    passcodeHash: user.passcodeHash,
    role: user.role,
  };
};
